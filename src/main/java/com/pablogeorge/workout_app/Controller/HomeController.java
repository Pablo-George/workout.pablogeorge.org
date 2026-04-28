package com.pablogeorge.workout_app.Controller;

import com.pablogeorge.workout_app.service.BodyWeightService;
import com.pablogeorge.workout_app.service.CoreWorkoutService;
import com.pablogeorge.workout_app.service.SocialService;
import com.pablogeorge.workout_app.service.WorkoutService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;

@Controller
public class HomeController {

    private final CoreWorkoutService coreWorkoutService;
    private final WorkoutService workoutService;
    private final BodyWeightService bodyWeightService;
    private final SocialService socialService;

    public HomeController(CoreWorkoutService coreWorkoutService,
                          WorkoutService workoutService,
                          BodyWeightService bodyWeightService,
                          SocialService socialService) {
        this.coreWorkoutService = coreWorkoutService;
        this.workoutService = workoutService;
        this.bodyWeightService = bodyWeightService;
        this.socialService = socialService;
    }

    @GetMapping("/")
    public String home(@AuthenticationPrincipal OidcUser principal, Model model) {
        String userId = principal.getEmail();
        String displayName = principal.getAttribute("name");
        String picture = principal.getAttribute("picture");

        // Keep profile fresh on every login
        socialService.upsertProfile(userId, displayName, picture);

        // Workout data
        model.addAttribute("coreWorkouts", coreWorkoutService.getAll(userId));
        model.addAttribute("weekLabels", workoutService.getWeekLabels(userId));
        model.addAttribute("chartDatasets", workoutService.buildChartDatasets(userId));
        model.addAttribute("totalSessions", workoutService.countLogs(userId));
        model.addAttribute("currentWeight", bodyWeightService.getLatest(userId).orElse(null));

        // Social data
        model.addAttribute("feedPosts", socialService.getFeed(userId));
        model.addAttribute("pendingRequests", socialService.getPendingRequests(userId));
        model.addAttribute("friendCount", socialService.getFriendCount(userId));

        // User info
        model.addAttribute("userName", displayName);
        model.addAttribute("userEmail", userId);
        model.addAttribute("userPicture", picture);

        return "home";
    }

    @PostMapping("/profile/lifts")
    public String addLift(@RequestParam String name,
                          @AuthenticationPrincipal OidcUser principal) {
        coreWorkoutService.add(name, principal.getEmail());
        return "redirect:/#tab-profile";
    }

    @PostMapping("/profile/lifts/delete")
    public String deleteLift(@RequestParam Long id) {
        coreWorkoutService.delete(id);
        return "redirect:/#tab-profile";
    }

    @PostMapping("/profile/weight")
    public String logWeight(@RequestParam double weightLbs,
                            @AuthenticationPrincipal OidcUser principal) {
        bodyWeightService.log(principal.getEmail(), weightLbs);
        return "redirect:/#tab-profile";
    }
}
