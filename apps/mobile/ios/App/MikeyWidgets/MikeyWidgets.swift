import ActivityKit
import SwiftUI
import WidgetKit

@main
struct MikeyWidgets: WidgetBundle {
    var body: some Widget {
        MikeyLiveActivity()
    }
}

struct MikeyLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: MikeyActivityAttributes.self) { context in
            LockScreenActivityView(context: context)
                .activityBackgroundTint(Color.black.opacity(0.88))
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    ActivitySymbol(context: context)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    ActivityMetric(state: context.state)
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(context.state.title)
                        .font(.headline)
                        .lineLimit(1)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack(spacing: 10) {
                        Text(context.state.detail)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(2)
                        Spacer(minLength: 4)
                        if let progress = context.state.progress {
                            ProgressView(value: progress)
                                .tint(Color(hex: context.state.tintHex))
                                .frame(width: 72)
                        }
                    }
                }
            } compactLeading: {
                Image(systemName: context.state.symbolName)
                    .foregroundStyle(Color(hex: context.state.tintHex))
            } compactTrailing: {
                CompactMetric(state: context.state)
            } minimal: {
                Image(systemName: context.state.symbolName)
                    .foregroundStyle(Color(hex: context.state.tintHex))
            }
            .keylineTint(Color(hex: context.state.tintHex))
        }
    }
}

private struct LockScreenActivityView: View {
    let context: ActivityViewContext<MikeyActivityAttributes>

    var body: some View {
        HStack(spacing: 14) {
            ActivitySymbol(context: context)
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text(context.attributes.category.uppercased())
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(Color(hex: context.state.tintHex))
                    Text("· MIKEY")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.secondary)
                }
                Text(context.state.title)
                    .font(.headline)
                    .lineLimit(1)
                Text(context.state.detail)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
                if let progress = context.state.progress {
                    ProgressView(value: progress)
                        .tint(Color(hex: context.state.tintHex))
                }
            }
            Spacer(minLength: 6)
            ActivityMetric(state: context.state)
        }
        .padding(16)
    }
}

private struct ActivitySymbol: View {
    let context: ActivityViewContext<MikeyActivityAttributes>

    var body: some View {
        Image(systemName: context.state.symbolName)
            .font(.title3.weight(.semibold))
            .foregroundStyle(Color(hex: context.state.tintHex))
            .frame(width: 42, height: 42)
            .background(Color(hex: context.state.tintHex).opacity(0.14), in: RoundedRectangle(cornerRadius: 13))
    }
}

private struct ActivityMetric: View {
    let state: MikeyActivityAttributes.ContentState

    var body: some View {
        if let targetDate = state.targetDate, targetDate > Date() {
            Text(timerInterval: Date()...targetDate, countsDown: true)
                .monospacedDigit()
                .font(.headline)
                .foregroundStyle(Color(hex: state.tintHex))
        } else if let progress = state.progress {
            Text(progress, format: .percent.precision(.fractionLength(0)))
                .monospacedDigit()
                .font(.headline)
                .foregroundStyle(Color(hex: state.tintHex))
        }
    }
}

private struct CompactMetric: View {
    let state: MikeyActivityAttributes.ContentState

    var body: some View {
        if let targetDate = state.targetDate, targetDate > Date() {
            Text(timerInterval: Date()...targetDate, countsDown: true)
                .monospacedDigit()
                .frame(width: 44)
        } else if let progress = state.progress {
            Text(progress, format: .percent.precision(.fractionLength(0)))
                .monospacedDigit()
        } else {
            Image(systemName: "checkmark")
        }
    }
}

private extension Color {
    init(hex: String) {
        let value = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        let parsed = UInt64(value, radix: 16) ?? 0x7CB7FF
        let red = Double((parsed >> 16) & 0xFF) / 255
        let green = Double((parsed >> 8) & 0xFF) / 255
        let blue = Double(parsed & 0xFF) / 255
        self.init(red: red, green: green, blue: blue)
    }
}
