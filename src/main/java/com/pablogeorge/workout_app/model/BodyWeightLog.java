package com.pablogeorge.workout_app.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDate;

@Entity
@Table(name = "body_weight_logs")
@Getter @Setter @NoArgsConstructor
public class BodyWeightLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String userId;

    @Column(nullable = false)
    private double weightLbs;

    @Column(nullable = false)
    private LocalDate loggedOn;

    public BodyWeightLog(String userId, double weightLbs) {
        this.userId = userId;
        this.weightLbs = weightLbs;
        this.loggedOn = LocalDate.now();
    }
}
