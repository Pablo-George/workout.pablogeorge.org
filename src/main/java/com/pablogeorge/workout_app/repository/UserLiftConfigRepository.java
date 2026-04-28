package com.pablogeorge.workout_app.repository;

import com.pablogeorge.workout_app.model.UserLiftConfig;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface UserLiftConfigRepository extends JpaRepository<UserLiftConfig, Long> {
    Optional<UserLiftConfig> findByUserIdAndLift_Id(String userId, Long liftId);
    List<UserLiftConfig> findByUserId(String userId);
}
