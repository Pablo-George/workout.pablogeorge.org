package com.pablogeorge.workout_app.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDate;

@Entity
@Table(name = "training_max_logs")
@Getter @Setter @NoArgsConstructor
public class TrainingMaxLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String userId;

    @ManyToOne(optional = false)
    private CoreWorkout lift;

    @Column(nullable = false)
    private double trainingMax;

    @Column(nullable = false)
    private LocalDate loggedOn;

    public TrainingMaxLog(String userId, CoreWorkout lift, double trainingMax) {
        this.userId = userId;
        this.lift = lift;
        this.trainingMax = trainingMax;
        this.loggedOn = LocalDate.now();
    }
}
