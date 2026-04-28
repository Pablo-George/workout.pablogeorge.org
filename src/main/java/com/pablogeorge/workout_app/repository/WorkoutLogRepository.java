package com.pablogeorge.workout_app.repository;

import com.pablogeorge.workout_app.model.WorkoutLog;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface WorkoutLogRepository extends JpaRepository<WorkoutLog, Long> {
    List<WorkoutLog> findByUserIdOrderByCompletedOnAsc(String userId);
    long countByUserId(String userId);
}
