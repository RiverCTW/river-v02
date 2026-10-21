import AppKit
import Foundation
import Vision

struct Observation: Codable {
    let text: String
    let confidence: Float
    let x: Int
    let y: Int
    let width: Int
    let height: Int
}

struct PageResult: Codable {
    let width: Int
    let height: Int
    let observations: [Observation]
}

guard CommandLine.arguments.count >= 4 else {
    fputs("usage: ocr_vision_tiles <image> <output-json> <tile-height>\n", stderr)
    exit(2)
}

let imageURL = URL(fileURLWithPath: CommandLine.arguments[1])
let outputURL = URL(fileURLWithPath: CommandLine.arguments[2])
let tileHeight = max(400, Int(CommandLine.arguments[3]) ?? 1200)
let overlap = 100

guard let image = NSImage(contentsOf: imageURL) else { exit(1) }
var rect = NSRect(origin: .zero, size: image.size)
guard let full = image.cgImage(forProposedRect: &rect, context: nil, hints: nil) else { exit(1) }

var observations: [Observation] = []
var top = 0
while top < full.height {
    let height = min(tileHeight, full.height - top)
    guard let tile = full.cropping(to: CGRect(x: 0, y: top, width: full.width, height: height)) else { break }
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.recognitionLanguages = ["zh-Hans", "en-US"]
    request.usesLanguageCorrection = true
    request.minimumTextHeight = 0.005
    let handler = VNImageRequestHandler(cgImage: tile, options: [:])
    try handler.perform([request])
    for observation in request.results ?? [] {
        guard let candidate = observation.topCandidates(1).first else { continue }
        let box = observation.boundingBox
        let px = Int(box.origin.x * CGFloat(tile.width))
        let py = top + Int((1 - box.origin.y - box.size.height) * CGFloat(tile.height))
        let pw = Int(box.size.width * CGFloat(tile.width))
        let ph = Int(box.size.height * CGFloat(tile.height))
        observations.append(Observation(text: candidate.string, confidence: candidate.confidence, x: px, y: py, width: pw, height: ph))
    }
    if top + height >= full.height { break }
    top += tileHeight - overlap
}

// Remove duplicate observations from the overlap region.
var seen = Set<String>()
let unique = observations.filter { item in
    let key = "\(item.text)|\(item.x / 4)|\(item.y / 4)"
    if seen.contains(key) { return false }
    seen.insert(key)
    return true
}.sorted { a, b in
    if abs(a.y - b.y) > 12 { return a.y < b.y }
    return a.x < b.x
}

let result = PageResult(width: full.width, height: full.height, observations: unique)
let encoder = JSONEncoder()
encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
try encoder.encode(result).write(to: outputURL)
print("observations=\(unique.count) size=\(full.width)x\(full.height) tiles=\((full.height + tileHeight - overlap - 1) / (tileHeight - overlap))")
