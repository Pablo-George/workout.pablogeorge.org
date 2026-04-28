package com.pablogeorge.workout_app.repository;

import com.pablogeorge.workout_app.model.BodyWeightLog;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface BodyWeightLogRepository extends JpaRepository<BodyWeightLog, Long> {
    Optional<BodyWeightLog> findTopByUserIdOrderByLoggedOnDesc(String userId);
}
