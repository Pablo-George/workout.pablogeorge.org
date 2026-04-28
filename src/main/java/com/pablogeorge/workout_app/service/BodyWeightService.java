package com.pablogeorge.workout_app.service;

import com.pablogeorge.workout_app.model.BodyWeightLog;
import com.pablogeorge.workout_app.repository.BodyWeightLogRepository;
import org.springframework.stereotype.Service;

import java.util.Optional;

@Service
public class BodyWeightService {

    private final BodyWeightLogRepository repo;

    public BodyWeightService(BodyWeightLogRepository repo) {
        this.repo = repo;
    }

    public void log(String userId, double weightLbs) {
        repo.save(new BodyWeightLog(userId, weightLbs));
    }

    public Optional<Double> getLatest(String userId) {
        return repo.findTopByUserIdOrderByLoggedOnDesc(userId)
            .map(BodyWeightLog::getWeightLbs);
    }
}
