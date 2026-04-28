package com.pablogeorge.workout_app.Controller;

import com.pablogeorge.workout_app.model.CoreWorkout;
import com.pablogeorge.workout_app.model.UserLiftConfig;
import com.pablogeorge.workout_app.service.CoreWorkoutService;
import com.pablogeorge.workout_app.service.WorkoutService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;

import java.util.Optional;

@Controller
public class WorkoutController {

    private final WorkoutService workoutService;
    private final CoreWorkoutService coreWorkoutService;

    public WorkoutController(WorkoutService workoutService, CoreWorkoutService coreWorkoutService) {
        this.workoutService = workoutService;
        this.coreWorkoutService = coreWorkoutService;
    }

    @GetMapping("/workout/{liftId}")
    public String workoutPage(
        @PathVariable Long liftId,
        @AuthenticationPrincipal OidcUser principal,
        Model model
    ) {
        CoreWorkout lift = coreWorkoutService.findById(liftId);
        String userId = principal.getEmail();
        Optional<UserLiftConfig> configOpt = workoutService.getConfig(userId, liftId);

        model.addAttribute("lift", lift);

        if (configOpt.isEmpty()) {
            model.addAttribute("needsSetup", true);
        } else {
            UserLiftConfig config = configOpt.get();
            model.addAttribute("needsSetup", false);
            model.addAttribute("plan", workoutService.buildPlan(config, lift));
        }

        return "workout";
    }

    @PostMapping("/workout/{liftId}/setup")
    public String setupTrainingMax(
        @PathVariable Long liftId,
        @RequestParam double trainingMax,
        @AuthenticationPrincipal OidcUser principal
    ) {
        CoreWorkout lift = coreWorkoutService.findById(liftId);
        workoutService.createConfig(principal.getEmail(), lift, trainingMax);
        return "redirect:/workout/" + liftId;
    }

    @PostMapping("/workout/{liftId}/update-tm")
    public String updateTrainingMax(
        @PathVariable Long liftId,
        @RequestParam double trainingMax,
        @AuthenticationPrincipal OidcUser principal
    ) {
        workoutService.getConfig(principal.getEmail(), liftId)
            .ifPresent(config -> workoutService.updateTrainingMax(config, trainingMax));
        return "redirect:/workout/" + liftId;
    }

    @PostMapping("/workout/{liftId}/complete")
    public String completeWorkout(
        @PathVariable Long liftId,
        @RequestParam int amrapReps,
        @AuthenticationPrincipal OidcUser principal
    ) {
        workoutService.getConfig(principal.getEmail(), liftId)
            .ifPresent(config -> workoutService.completeWorkout(config, amrapReps));
        return "redirect:/";
    }
}
