import Foundation

enum APIError: Error, LocalizedError {
    case server(String)
    case network(Error)
    case decoding(Error)
    case unauthorized

    var errorDescription: String? {
        switch self {
        case .server(let message): return message
        case .network: return "Couldn't reach the server. Check your connection."
        case .decoding: return "Got an unexpected response from the server."
        case .unauthorized: return "You've been signed out. Please sign in again."
        }
    }
}

/// Talks to the existing Express backend's /api/* JSON layer. Auth is a
/// bearer JWT (see server/src/middleware/auth.ts's apiAuth + signNativeToken)
/// rather than a cookie session, since this app doesn't share cookie storage
/// with the ASWebAuthenticationSession used to sign in.
actor APIClient {
    static let shared = APIClient()

    /// Point this at your deployed server. Swap for a debug build config /
    /// scheme environment variable if you also run against localhost.
    private let baseURL = URL(string: "https://workout.pablogeorge.org/api")!

    private let session: URLSession = {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 20
        return URLSession(configuration: config)
    }()

    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        return d
    }()

    private func makeRequest(path: String, method: String, body: Data?, contentType: String?) async throws -> URLRequest {
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.httpMethod = method
        if let token = await AuthManager.shared.token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let contentType {
            request.setValue(contentType, forHTTPHeaderField: "Content-Type")
        }
        request.httpBody = body
        return request
    }

    private func send<T: Decodable>(path: String, method: String, body: Data? = nil, contentType: String? = "application/json") async throws -> T {
        let request = try await makeRequest(path: path, method: method, body: body, contentType: contentType)

        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw APIError.network(error)
        }

        guard let http = response as? HTTPURLResponse else { throw APIError.network(URLError(.badServerResponse)) }

        if http.statusCode == 401 {
            await AuthManager.shared.signOut()
            throw APIError.unauthorized
        }

        do {
            let envelope = try decoder.decode(APIEnvelope<T>.self, from: data)
            if let error = envelope.error { throw APIError.server(error) }
            guard let value = envelope.data else { throw APIError.decoding(URLError(.cannotParseResponse)) }
            return value
        } catch let error as APIError {
            throw error
        } catch {
            throw APIError.decoding(error)
        }
    }

    // MARK: - Generic verbs

    func get<T: Decodable>(_ path: String) async throws -> T {
        try await send(path: path, method: "GET")
    }

    func post<T: Decodable, B: Encodable>(_ path: String, body: B) async throws -> T {
        let data = try JSONEncoder().encode(body)
        return try await send(path: path, method: "POST", body: data)
    }

    func post<T: Decodable>(_ path: String) async throws -> T {
        try await send(path: path, method: "POST", body: Data("{}".utf8))
    }

    func patch<T: Decodable, B: Encodable>(_ path: String, body: B) async throws -> T {
        let data = try JSONEncoder().encode(body)
        return try await send(path: path, method: "PATCH", body: data)
    }

    @discardableResult
    func delete<T: Decodable>(_ path: String) async throws -> T {
        try await send(path: path, method: "DELETE")
    }

    /// Multipart upload for social posts and calorie photo entries.
    func postMultipart<T: Decodable>(_ path: String, fields: [String: String], fileField: String?, fileData: Data?, fileName: String?, mimeType: String?) async throws -> T {
        let boundary = "Boundary-\(UUID().uuidString)"
        var body = Data()

        for (key, value) in fields {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"\(key)\"\r\n\r\n".data(using: .utf8)!)
            body.append("\(value)\r\n".data(using: .utf8)!)
        }

        if let fileField, let fileData, let fileName, let mimeType {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"\(fileField)\"; filename=\"\(fileName)\"\r\n".data(using: .utf8)!)
            body.append("Content-Type: \(mimeType)\r\n\r\n".data(using: .utf8)!)
            body.append(fileData)
            body.append("\r\n".data(using: .utf8)!)
        }

        body.append("--\(boundary)--\r\n".data(using: .utf8)!)

        return try await send(path: path, method: "POST", body: body, contentType: "multipart/form-data; boundary=\(boundary)")
    }
}
