package com.pablogeorge.workout_app.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

import java.io.IOException;
import java.util.Set;
import java.util.UUID;

@Service
public class ImageStorageService {

    private static final Set<String> ALLOWED_TYPES =
        Set.of("image/jpeg", "image/png", "image/gif", "image/webp");

    private final S3Client s3;

    @Value("${aws.s3.bucket}")
    private String bucket;

    @Value("${aws.s3.region:us-east-1}")
    private String region;

    public ImageStorageService(S3Client s3) {
        this.s3 = s3;
    }

    public String upload(MultipartFile file) throws IOException {
        String contentType = file.getContentType();
        if (contentType == null || !ALLOWED_TYPES.contains(contentType)) {
            throw new IllegalArgumentException("Only JPEG, PNG, GIF, and WebP images are allowed.");
        }

        String key = "posts/" + UUID.randomUUID() + extensionFor(contentType);

        s3.putObject(
            PutObjectRequest.builder()
                .bucket(bucket)
                .key(key)
                .contentType(contentType)
                .build(),
            RequestBody.fromBytes(file.getBytes())
        );

        return "https://%s.s3.%s.amazonaws.com/%s".formatted(bucket, region, key);
    }

    private String extensionFor(String contentType) {
        return switch (contentType) {
            case "image/jpeg" -> ".jpg";
            case "image/png"  -> ".png";
            case "image/gif"  -> ".gif";
            case "image/webp" -> ".webp";
            default -> "";
        };
    }
}
