package com.pablogeorge.workout_app.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "core_workouts",
       uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "name"}))
@Getter @Setter @NoArgsConstructor
public class CoreWorkout {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    @Column(name = "user_id", nullable = false)
    private String userId;

    public CoreWorkout(String name, String userId) {
        this.name = name;
        this.userId = userId;
    }
}
