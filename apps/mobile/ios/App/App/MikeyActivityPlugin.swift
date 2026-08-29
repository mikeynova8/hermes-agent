import ActivityKit
import Capacitor
import Foundation

@objc(MikeyActivityPlugin)
public final class MikeyActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "MikeyActivityPlugin"
    public let jsName = "MikeyActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end", returnType: CAPPluginReturnPromise)
    ]

    @objc public func isAvailable(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.resolve(["available": false, "enabled": false])
            return
        }
        call.resolve([
            "available": true,
            "enabled": ActivityAuthorizationInfo().areActivitiesEnabled
        ])
    }

    @objc public func start(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.reject("Live Activities require iOS 16.2 or later")
            return
        }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            call.reject("Live Activities are disabled for Mikey")
            return
        }

        do {
            let attributes = MikeyActivityAttributes(
                contextID: call.getString("contextID") ?? UUID().uuidString,
                category: call.getString("category") ?? "Update"
            )
            let state = try contentState(from: call)
            let content = ActivityContent(state: state, staleDate: staleDate(from: call))

            Task {
                if let existing = Activity<MikeyActivityAttributes>.activities.first(where: {
                    $0.attributes.contextID == attributes.contextID
                }) {
                    await existing.update(content)
                    call.resolve(["activityID": existing.id])
                    return
                }

                do {
                    let activity = try Activity.request(
                        attributes: attributes,
                        content: content,
                        pushType: nil
                    )
                    call.resolve(["activityID": activity.id])
                } catch {
                    call.reject("Could not start the Live Activity", nil, error)
                }
            }
        } catch {
            call.reject("Could not prepare the Live Activity", nil, error)
        }
    }

    @objc public func update(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.reject("Live Activities require iOS 16.2 or later")
            return
        }
        do {
            let activity = try activity(for: call)
            let state = try contentState(from: call)
            Task {
                await activity.update(
                    ActivityContent(state: state, staleDate: staleDate(from: call))
                )
                call.resolve(["activityID": activity.id])
            }
        } catch {
            call.reject("Could not update the Live Activity", nil, error)
        }
    }

    @objc public func end(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.reject("Live Activities require iOS 16.2 or later")
            return
        }
        do {
            let activity = try activity(for: call)
            let state = try contentState(from: call)
            Task {
                await activity.end(
                    ActivityContent(state: state, staleDate: nil),
                    dismissalPolicy: call.getBool("immediate") == true ? .immediate : .default
                )
                call.resolve(["activityID": activity.id])
            }
        } catch {
            call.reject("Could not end the Live Activity", nil, error)
        }
    }

    @available(iOS 16.2, *)
    private func activity(for call: CAPPluginCall) throws -> Activity<MikeyActivityAttributes> {
        let requestedID = call.getString("activityID")
        if let requestedID,
           let activity = Activity<MikeyActivityAttributes>.activities.first(where: { $0.id == requestedID }) {
            return activity
        }
        if requestedID == nil, let activity = Activity<MikeyActivityAttributes>.activities.first {
            return activity
        }
        throw NSError(domain: "MikeyActivity", code: 404, userInfo: [
            NSLocalizedDescriptionKey: "No matching Live Activity is running"
        ])
    }

    @available(iOS 16.2, *)
    private func contentState(from call: CAPPluginCall) throws -> MikeyActivityAttributes.ContentState {
        guard let title = call.getString("title")?.trimmingCharacters(in: .whitespacesAndNewlines), !title.isEmpty else {
            throw NSError(domain: "MikeyActivity", code: 400, userInfo: [
                NSLocalizedDescriptionKey: "A title is required"
            ])
        }
        let progress = call.getDouble("progress").map { min(max($0, 0), 1) }
        return MikeyActivityAttributes.ContentState(
            title: title,
            detail: call.getString("detail") ?? "",
            symbolName: call.getString("symbolName") ?? "sparkles",
            tintHex: call.getString("tintHex") ?? "7CB7FF",
            progress: progress,
            targetDate: date(milliseconds: call.getDouble("targetDate")),
            updatedAt: Date()
        )
    }

    private func date(milliseconds: Double?) -> Date? {
        milliseconds.map { Date(timeIntervalSince1970: $0 / 1_000) }
    }

    private func staleDate(from call: CAPPluginCall) -> Date? {
        date(milliseconds: call.getDouble("staleDate"))
    }
}
