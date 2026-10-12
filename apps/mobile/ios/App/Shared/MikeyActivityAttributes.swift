import ActivityKit
import Foundation

struct MikeyActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var title: String
        var detail: String
        var symbolName: String
        var tintHex: String
        var progress: Double?
        var targetDate: Date?
        var updatedAt: Date
    }

    var contextID: String
    var category: String
}
