package com.pablogeorge.workout_app.repository;

import com.pablogeorge.workout_app.model.TrainingMaxLog;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface TrainingMaxLogRepository extends JpaRepository<TrainingMaxLog, Long> {
    List<TrainingMaxLog> findByUserIdOrderByLoggedOnAsc(String userId);
}
