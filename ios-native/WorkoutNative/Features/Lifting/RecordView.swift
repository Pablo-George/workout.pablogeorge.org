import SwiftUI

struct RecordView: View {
    @State private var selected: Section = .lifting

    private enum Section: String, CaseIterable, Identifiable {
        case lifting = "Lifting", calisthenics = "Calisthenics", running = "Running"
        var id: String { rawValue }
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Picker("Section", selection: $selected) {
                    ForEach(Section.allCases) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented)
                .padding()

                switch selected {
                case .lifting: LiftListView()
                case .calisthenics: CalisthenicsView()
                case .running: RunningView()
                }
            }
        }
    }
}
