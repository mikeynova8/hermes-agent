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
        CAPPluginMethod(name: "searchContacts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readLocation", returnType: CAPPluginReturnPromise)
    ]

    private let contacts = CNContactStore()
    private let location = OneShotLocationReader()

    @objc public func authorizationStatus(_ call: CAPPluginCall) {
        let contactStatus = CNContactStore.authorizationStatus(for: .contacts)
        let locationStatus = CLLocationManager.authorizationStatus()
        call.resolve([
            "contacts": contactStatus == .authorized ? "authorized" : isLimited(contactStatus) ? "limited" : statusName(contactStatus),
            "location": statusName(locationStatus)
        ])
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
        let status = CLLocationManager.authorizationStatus()
        guard status == .authorizedWhenInUse else {
            if status == .notDetermined {
                location.requestWhenInUse { [weak self] granted in
                    guard granted else { call.reject("Location permission was not granted", "permission_denied"); return }
                    self?.readLocation(call)
                }
            } else {
                call.reject("While-in-use location is unavailable", "permission_denied")
            }
            return
        }
        location.read(timeout: 8) { result in
            switch result {
            case .success(let value): call.resolve(value)
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

    private func statusName(_ status: CLAuthorizationStatus) -> String {
        switch status {
        case .authorizedWhenInUse: return "authorizedWhenInUse"
        case .authorizedAlways: return "authorizedAlways"
        case .denied: return "denied"
        case .restricted: return "restricted"
        default: return "notDetermined"
        }
    }

    private func isLimited(_ status: CNAuthorizationStatus) -> Bool {
        if #available(iOS 18.0, *) { return status == .limited }
        return false
    }

    private func statusName(_ status: CNAuthorizationStatus) -> String {
        if status == .authorized { return "authorized" }
        if isLimited(status) { return "limited" }
        switch status {
        case .denied: return "denied"
        case .restricted: return "restricted"
        default: return "notDetermined"
        }
    }
}

private final class OneShotLocationReader: NSObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    private var completion: ((Result<[String: Any], Error>) -> Void)?
    private var authorizationCompletion: ((Bool) -> Void)?
    private var timer: Timer?

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
        manager.distanceFilter = kCLDistanceFilterNone
    }

    func requestWhenInUse(completion: @escaping (Bool) -> Void) {
        switch CLLocationManager.authorizationStatus() {
        case .authorizedWhenInUse:
            completion(true)
        case .denied, .restricted, .authorizedAlways:
            completion(false)
        case .notDetermined:
            authorizationCompletion = completion
            manager.requestWhenInUseAuthorization()
        @unknown default:
            completion(false)
        }
    }

    func read(timeout: TimeInterval, completion: @escaping (Result<[String: Any], Error>) -> Void) {
        self.completion = completion
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: timeout, repeats: false) { [weak self] _ in
            self?.finish(.failure(NSError(domain: "MikeyPhoneData", code: 408, userInfo: [NSLocalizedDescriptionKey: "Location request timed out"])))
        }
        manager.requestLocation()
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        guard let callback = authorizationCompletion else { return }
        let status = manager.authorizationStatus
        guard status != .notDetermined else { return }
        authorizationCompletion = nil
        callback(status == .authorizedWhenInUse)
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }
        finish(.success(["latitude": location.coordinate.latitude, "longitude": location.coordinate.longitude, "accuracyMeters": location.horizontalAccuracy, "timestamp": ISO8601DateFormatter().string(from: location.timestamp)]))
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) { finish(.failure(error)) }
    private func finish(_ result: Result<[String: Any], Error>) { timer?.invalidate(); timer = nil; let callback = completion; completion = nil; callback?(result) }
}
