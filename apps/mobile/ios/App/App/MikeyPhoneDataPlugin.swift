import Capacitor
import Contacts
import CoreLocation
import Foundation

@objc(MikeyPhoneDataPlugin)
public final class MikeyPhoneDataPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "MikeyPhoneDataPlugin"
    public let jsName = "MikeyPhoneData"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "authorizationStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAlwaysAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startBackgroundLocation", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopBackgroundLocation", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "searchContacts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readLocation", returnType: CAPPluginReturnPromise)
    ]

    private let contacts = CNContactStore()
    private let location = LocationReader()

    @objc public func authorizationStatus(_ call: CAPPluginCall) {
        call.resolve([
            "contacts": contactStatusName(CNContactStore.authorizationStatus(for: .contacts)),
            "location": location.statusName
        ])
    }

    @objc public func requestAlwaysAuthorization(_ call: CAPPluginCall) {
        location.requestAlwaysAuthorization { result in
            switch result {
            case .success(let status): call.resolve(["location": status])
            case .failure(let error): call.reject(error.message, error.code)
            }
        }
    }

    @objc public func startBackgroundLocation(_ call: CAPPluginCall) {
        do {
            try location.startBackgroundUpdates { [weak self] value in
                // Keep this an event-only bridge. The app does not upload a
                // location in the background or retain a history; JS may act
                // on the latest value only when its selected session is active.
                self?.notifyListeners("locationUpdate", data: value)
            }
            call.resolve(["location": location.statusName, "mode": "significant-change"])
        } catch let error as LocationReaderError {
            call.reject(error.message, error.code)
        } catch {
            call.reject("Background location is unavailable", "location_unavailable")
        }
    }

    @objc public func stopBackgroundLocation(_ call: CAPPluginCall) {
        location.stopBackgroundUpdates()
        call.resolve(["location": location.statusName, "mode": "stopped"])
    }

    @objc public func searchContacts(_ call: CAPPluginCall) {
        guard let rawQuery = call.getString("query")?.trimmingCharacters(in: .whitespacesAndNewlines),
              rawQuery.count >= 2, rawQuery.count <= 64 else {
            call.reject("Contact search requires 2–64 characters", "invalid_query")
            return
        }
        guard currentContactsPermission(call: call) else { return }
        let limit = min(max(call.getInt("limit") ?? 10, 1), 10)
        let keys: [CNKeyDescriptor] = [
            CNContactIdentifierKey as CNKeyDescriptor,
            CNContactGivenNameKey as CNKeyDescriptor,
            CNContactFamilyNameKey as CNKeyDescriptor,
            CNContactOrganizationNameKey as CNKeyDescriptor,
            CNContactPhoneNumbersKey as CNKeyDescriptor,
            CNContactEmailAddressesKey as CNKeyDescriptor
        ]
        do {
            let matches = try contacts.unifiedContacts(matching: CNContact.predicateForContacts(matchingName: rawQuery), keysToFetch: keys)
            let result = matches.prefix(limit).map { contact in
                [
                    "id": contact.identifier,
                    "name": [contact.givenName, contact.familyName].filter { !$0.isEmpty }.joined(separator: " "),
                    "organization": contact.organizationName,
                    "phones": contact.phoneNumbers.prefix(3).map { $0.value.stringValue },
                    "emails": contact.emailAddresses.prefix(3).map { String($0.value) }
                ] as [String : Any]
            }
            call.resolve(["results": result, "limited": isLimited(CNContactStore.authorizationStatus(for: .contacts))])
        } catch {
            call.reject("Contacts are unavailable", "contacts_unavailable")
        }
    }

    @objc public func readLocation(_ call: CAPPluginCall) {
        location.read(timeout: 8) { result in
            switch result {
            case .success(let value): call.resolve(value)
            case .failure(let error as LocationReaderError): call.reject(error.message, error.code)
            case .failure(let error): call.reject(error.localizedDescription, "location_unavailable")
            }
        }
    }

    private func currentContactsPermission(call: CAPPluginCall) -> Bool {
        switch CNContactStore.authorizationStatus(for: .contacts) {
        case .authorized, .limited: return true
        case .notDetermined:
            contacts.requestAccess(for: .contacts) { [weak self] granted, _ in
                DispatchQueue.main.async {
                    guard granted else { call.reject("Contacts permission was not granted", "permission_denied"); return }
                    self?.searchContacts(call)
                }
            }
            return false
        default:
            call.reject("Contacts permission is unavailable", "permission_denied")
            return false
        }
    }

    private func contactStatusName(_ status: CNAuthorizationStatus) -> String {
        if status == .authorized { return "authorized" }
        if isLimited(status) { return "limited" }
        switch status {
        case .denied: return "denied"
        case .restricted: return "restricted"
        default: return "notDetermined"
        }
    }

    private func isLimited(_ status: CNAuthorizationStatus) -> Bool {
        if #available(iOS 18.0, *) { return status == .limited }
        return false
    }
}

private enum LocationReaderError: Error {
    case unavailable, denied, restricted, requiresWhenInUse, timeout
    var code: String {
        switch self { case .unavailable: return "location_unavailable"; case .denied: return "permission_denied"; case .restricted: return "permission_restricted"; case .requiresWhenInUse: return "permission_escalation_required"; case .timeout: return "location_timeout" }
    }
    var message: String {
        switch self { case .unavailable: return "Location services are unavailable"; case .denied: return "Location permission was denied"; case .restricted: return "Location permission is restricted"; case .requiresWhenInUse: return "While-in-use location permission is required before Always"; case .timeout: return "Location request timed out" }
    }
}

private final class LocationReader: NSObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    private var completion: ((Result<[String: Any], Error>) -> Void)?
    private var authorizationCompletion: ((Result<String, LocationReaderError>) -> Void)?
    private var timer: Timer?
    private var backgroundHandler: (([String: Any]) -> Void)?

    var statusName: String {
        guard CLLocationManager.locationServicesEnabled() else { return "unavailable" }
        switch manager.authorizationStatus {
        case .authorizedWhenInUse: return "authorizedWhenInUse"
        case .authorizedAlways: return "authorizedAlways"
        case .denied: return "denied"
        case .restricted: return "restricted"
        default: return "notDetermined"
        }
    }

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
        manager.distanceFilter = 100
        manager.pausesLocationUpdatesAutomatically = true
    }

    func requestAlwaysAuthorization(completion: @escaping (Result<String, LocationReaderError>) -> Void) {
        guard CLLocationManager.locationServicesEnabled() else { completion(.failure(.unavailable)); return }
        switch manager.authorizationStatus {
        case .authorizedAlways: completion(.success("authorizedAlways"))
        case .authorizedWhenInUse:
            authorizationCompletion = completion
            manager.requestAlwaysAuthorization()
        case .denied: completion(.failure(.denied))
        case .restricted: completion(.failure(.restricted))
        case .notDetermined: completion(.failure(.requiresWhenInUse))
        @unknown default: completion(.failure(.unavailable))
        }
    }

    func startBackgroundUpdates(handler: @escaping ([String: Any]) -> Void) throws {
        guard CLLocationManager.locationServicesEnabled() else { throw LocationReaderError.unavailable }
        guard manager.authorizationStatus == .authorizedAlways else {
            switch manager.authorizationStatus { case .denied: throw LocationReaderError.denied; case .restricted: throw LocationReaderError.restricted; default: throw LocationReaderError.requiresWhenInUse }
        }
        backgroundHandler = handler
        manager.allowsBackgroundLocationUpdates = true
        manager.startMonitoringSignificantLocationChanges()
    }

    func stopBackgroundUpdates() {
        manager.stopMonitoringSignificantLocationChanges()
        manager.allowsBackgroundLocationUpdates = false
        backgroundHandler = nil
    }

    func read(timeout: TimeInterval, completion: @escaping (Result<[String: Any], Error>) -> Void) {
        guard CLLocationManager.locationServicesEnabled() else { completion(.failure(LocationReaderError.unavailable)); return }
        guard manager.authorizationStatus == .authorizedWhenInUse || manager.authorizationStatus == .authorizedAlways else {
            completion(.failure(manager.authorizationStatus == .restricted ? LocationReaderError.restricted : .denied)); return
        }
        self.completion = completion
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: timeout, repeats: false) { [weak self] _ in self?.finish(.failure(LocationReaderError.timeout)) }
        manager.requestLocation()
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        guard let callback = authorizationCompletion, manager.authorizationStatus != .notDetermined else { return }
        authorizationCompletion = nil
        switch manager.authorizationStatus {
        case .authorizedAlways: callback(.success("authorizedAlways"))
        case .authorizedWhenInUse: callback(.failure(.requiresWhenInUse))
        case .denied: callback(.failure(.denied))
        case .restricted: callback(.failure(.restricted))
        default: callback(.failure(.unavailable))
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }
        let value: [String: Any] = ["latitude": location.coordinate.latitude, "longitude": location.coordinate.longitude, "accuracyMeters": location.horizontalAccuracy, "timestamp": ISO8601DateFormatter().string(from: location.timestamp)]
        if backgroundHandler != nil && completion == nil { backgroundHandler?(value); return }
        finish(.success(value))
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) { finish(.failure(error)) }
    private func finish(_ result: Result<[String: Any], Error>) { timer?.invalidate(); timer = nil; let callback = completion; completion = nil; callback?(result) }
}
