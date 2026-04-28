package com.pablogeorge.workout_app.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

@Entity
@Table(name = "posts")
@Getter @Setter @NoArgsConstructor
public class Post {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String authorId;

    @Column(length = 280)
    private String content;

    @Column
    private String imageUrl;

    @Column(nullable = false)
    private LocalDateTime createdAt;

    public Post(String authorId, String content, String imageUrl) {
        this.authorId = authorId;
        this.content = content;
        this.imageUrl = imageUrl;
        this.createdAt = LocalDateTime.now();
    }
}
