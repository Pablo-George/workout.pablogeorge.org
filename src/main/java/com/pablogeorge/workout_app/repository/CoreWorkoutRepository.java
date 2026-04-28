package com.pablogeorge.workout_app.repository;

import com.pablogeorge.workout_app.model.CoreWorkout;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CoreWorkoutRepository extends JpaRepository<CoreWorkout, Long> {
    List<CoreWorkout> findByUserId(String userId);
}
