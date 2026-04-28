package com.pablogeorge.workout_app.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "user_profiles")
@Getter @Setter @NoArgsConstructor
public class UserProfile {

    @Id
    private String userId; // email

    @Column(nullable = false)
    private String displayName;

    private String pictureUrl;

    public UserProfile(String userId, String displayName, String pictureUrl) {
        this.userId = userId;
        this.displayName = displayName;
        this.pictureUrl = pictureUrl;
    }
}
