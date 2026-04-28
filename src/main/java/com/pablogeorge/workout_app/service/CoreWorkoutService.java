package com.pablogeorge.workout_app.service;

import com.pablogeorge.workout_app.model.CoreWorkout;
import com.pablogeorge.workout_app.repository.CoreWorkoutRepository;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class CoreWorkoutService {

    private static final List<String> DEFAULT_LIFTS =
        List.of("Bench Press", "Squat", "Deadlift", "Overhead Press");

    private final CoreWorkoutRepository repo;

    public CoreWorkoutService(CoreWorkoutRepository repo) {
        this.repo = repo;
    }

    public List<CoreWorkout> getAll(String userId) {
        List<CoreWorkout> lifts = repo.findByUserId(userId);
        if (lifts.isEmpty()) {
            repo.saveAll(DEFAULT_LIFTS.stream()
                .map(name -> new CoreWorkout(name, userId))
                .toList());
            lifts = repo.findByUserId(userId);
        }
        return lifts;
    }

    public CoreWorkout findById(Long id) {
        return repo.findById(id)
            .orElseThrow(() -> new IllegalArgumentException("Lift not found: " + id));
    }

    public void add(String name, String userId) {
        repo.save(new CoreWorkout(name.trim(), userId));
    }

    public void delete(Long id) {
        repo.deleteById(id);
    }
}
