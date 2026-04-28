package com.pablogeorge.workout_app.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "user_lift_configs",
       uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "lift_id"}))
@Getter @Setter @NoArgsConstructor
public class UserLiftConfig {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private String userId;

    @ManyToOne(optional = false)
    private CoreWorkout lift;

    @Column(nullable = false)
    private double trainingMax;

    @Column(nullable = false)
    private int currentWeek = 1;

    public UserLiftConfig(String userId, CoreWorkout lift, double trainingMax) {
        this.userId = userId;
        this.lift = lift;
        this.trainingMax = trainingMax;
        this.currentWeek = 1;
    }
}
