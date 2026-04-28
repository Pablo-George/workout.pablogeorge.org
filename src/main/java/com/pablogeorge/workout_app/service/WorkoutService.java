package com.pablogeorge.workout_app.service;

import com.pablogeorge.workout_app.model.CoreWorkout;
import com.pablogeorge.workout_app.model.TrainingMaxLog;
import com.pablogeorge.workout_app.model.UserLiftConfig;
import com.pablogeorge.workout_app.model.WorkoutLog;
import com.pablogeorge.workout_app.repository.TrainingMaxLogRepository;
import com.pablogeorge.workout_app.repository.UserLiftConfigRepository;
import com.pablogeorge.workout_app.repository.WorkoutLogRepository;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
public class WorkoutService {

    private final UserLiftConfigRepository repo;
    private final WorkoutLogRepository logRepo;
    private final TrainingMaxLogRepository tmLogRepo;

    public WorkoutService(UserLiftConfigRepository repo,
                          WorkoutLogRepository logRepo,
                          TrainingMaxLogRepository tmLogRepo) {
        this.repo = repo;
        this.logRepo = logRepo;
        this.tmLogRepo = tmLogRepo;
    }

    // ── Program definition ────────────────────────────────────────────────────

    private record SetDef(double pct, int reps, boolean amrap, boolean warmup) {}

    private static final List<List<SetDef>> PROGRAM = List.of(
        List.of(
            new SetDef(0.50, 5, false, true),
            new SetDef(0.50, 5, false, true),
            new SetDef(0.65, 5, false, false),
            new SetDef(0.75, 5, false, false),
            new SetDef(0.85, 0, true,  false)
        ),
        List.of(
            new SetDef(0.50, 5, false, true),
            new SetDef(0.50, 5, false, true),
            new SetDef(0.70, 5, false, false),
            new SetDef(0.80, 3, false, false),
            new SetDef(0.90, 0, true,  false)
        ),
        List.of(
            new SetDef(0.50, 5, false, true),
            new SetDef(0.50, 5, false, true),
            new SetDef(0.75, 3, false, false),
            new SetDef(0.85, 3, false, false),
            new SetDef(0.95, 0, true,  false)
        ),
        List.of(
            new SetDef(0.40, 5, false, true),
            new SetDef(0.40, 5, false, true),
            new SetDef(0.50, 5, false, false),
            new SetDef(0.60, 5, false, false),
            new SetDef(0.70, 0, true,  false)
        )
    );

    // ── Public records ────────────────────────────────────────────────────────

    public record WorkoutSet(
        boolean warmup,
        String percentageLabel,
        double weight,
        int reps,
        boolean amrap,
        String platesDisplay
    ) {
        public String repsLabel() {
            return amrap ? "AMRAP" : reps + " reps";
        }
    }

    public record WorkoutPlan(
        String liftName,
        int week,
        double trainingMax,
        List<WorkoutSet> sets
    ) {
        public String weekLabel() {
            return switch (week) {
                case 1 -> "5s Week";
                case 2 -> "3s Week";
                case 3 -> "5/3/1 Week";
                case 4 -> "Deload";
                default -> "Week " + week;
            };
        }
    }

    // ── Config management ─────────────────────────────────────────────────────

    public Optional<UserLiftConfig> getConfig(String userId, Long liftId) {
        return repo.findByUserIdAndLift_Id(userId, liftId);
    }

    public UserLiftConfig createConfig(String userId, CoreWorkout lift, double trainingMax) {
        UserLiftConfig config = repo.save(new UserLiftConfig(userId, lift, trainingMax));
        tmLogRepo.save(new TrainingMaxLog(userId, lift, trainingMax));
        return config;
    }

    public void updateTrainingMax(UserLiftConfig config, double newMax) {
        config.setTrainingMax(newMax);
        repo.save(config);
        tmLogRepo.save(new TrainingMaxLog(config.getUserId(), config.getLift(), newMax));
    }

    public Map<Long, String> getWeekLabels(String userId) {
        return repo.findByUserId(userId).stream()
            .collect(Collectors.toMap(
                c -> c.getLift().getId(),
                c -> "Week " + c.getCurrentWeek() + " · " + weekLabel(c.getCurrentWeek())
            ));
    }

    // ── Workout execution ─────────────────────────────────────────────────────

    public WorkoutPlan buildPlan(UserLiftConfig config, CoreWorkout lift) {
        List<SetDef> defs = PROGRAM.get(config.getCurrentWeek() - 1);
        List<WorkoutSet> sets = defs.stream().map(def -> {
            double weight = roundUpTo5(config.getTrainingMax() * def.pct());
            return new WorkoutSet(
                def.warmup(),
                (int)(def.pct() * 100) + "%",
                weight,
                def.reps(),
                def.amrap(),
                platesDisplay(weight)
            );
        }).toList();
        return new WorkoutPlan(lift.getName(), config.getCurrentWeek(), config.getTrainingMax(), sets);
    }

    public void completeWorkout(UserLiftConfig config, int amrapReps) {
        logRepo.save(new WorkoutLog(config.getUserId(), config.getLift(), config.getCurrentWeek(), amrapReps));
        int next = (config.getCurrentWeek() % 4) + 1;
        config.setCurrentWeek(next);
        repo.save(config);
    }

    public long countLogs(String userId) {
        return logRepo.countByUserId(userId);
    }

    // ── Chart: training max over time ─────────────────────────────────────────

    private static final String[] CHART_COLORS = {
        "#4f9eff", "#4ade80", "#fb923c", "#a78bfa", "#f472b6"
    };

    public List<Map<String, Object>> buildChartDatasets(String userId) {
        List<TrainingMaxLog> logs = tmLogRepo.findByUserIdOrderByLoggedOnAsc(userId);

        Map<String, List<TrainingMaxLog>> byLift = new LinkedHashMap<>();
        for (TrainingMaxLog log : logs) {
            byLift.computeIfAbsent(log.getLift().getName(), k -> new ArrayList<>()).add(log);
        }

        List<Map<String, Object>> datasets = new ArrayList<>();
        int i = 0;
        for (var entry : byLift.entrySet()) {
            List<Map<String, Object>> points = entry.getValue().stream()
                .map(log -> Map.<String, Object>of(
                    "x", log.getLoggedOn().toString(),
                    "y", log.getTrainingMax()
                ))
                .toList();

            datasets.add(Map.of(
                "label", entry.getKey(),
                "color", CHART_COLORS[i % CHART_COLORS.length],
                "points", points
            ));
            i++;
        }
        return datasets;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private String weekLabel(int week) {
        return switch (week) {
            case 1 -> "5s";
            case 2 -> "3s";
            case 3 -> "5/3/1";
            case 4 -> "Deload";
            default -> "Week " + week;
        };
    }

    private double roundUpTo5(double weight) {
        return Math.ceil(weight / 5.0) * 5.0;
    }

    private String platesDisplay(double totalWeight) {
        double perSide = (totalWeight - 45) / 2;
        double[] plateTypes = {45, 35, 25, 10, 5, 2.5};
        List<String> plates = new ArrayList<>();
        double remaining = perSide;

        for (double plate : plateTypes) {
            while (remaining >= plate - 0.01) {
                plates.add(plate == (int) plate
                    ? String.valueOf((int) plate)
                    : String.valueOf(plate));
                remaining -= plate;
            }
        }
        return plates.isEmpty() ? "bar only" : String.join(", ", plates);
    }
}
