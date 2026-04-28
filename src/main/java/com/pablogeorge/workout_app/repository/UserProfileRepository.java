package com.pablogeorge.workout_app.repository;

import com.pablogeorge.workout_app.model.UserProfile;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserProfileRepository extends JpaRepository<UserProfile, String> {
}
