package com.pablogeorge.workout_app.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDate;

@Entity
@Table(name = "workout_logs")
@Getter @Setter @NoArgsConstructor
public class WorkoutLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String userId;

    @ManyToOne(optional = false)
    private CoreWorkout lift;

    @Column(nullable = false)
    private int week;

    @Column(nullable = false)
    private int amrapReps;

    @Column(nullable = false)
    private LocalDate completedOn;

    public WorkoutLog(String userId, CoreWorkout lift, int week, int amrapReps) {
        this.userId = userId;
        this.lift = lift;
        this.week = week;
        this.amrapReps = amrapReps;
        this.completedOn = LocalDate.now();
    }
}
