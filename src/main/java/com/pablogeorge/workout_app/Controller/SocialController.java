package com.pablogeorge.workout_app.Controller;

import com.pablogeorge.workout_app.service.ImageStorageService;
import com.pablogeorge.workout_app.service.SocialService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.multipart.MultipartFile;

@Controller
public class SocialController {

    private final SocialService socialService;
    private final ImageStorageService imageStorageService;

    public SocialController(SocialService socialService, ImageStorageService imageStorageService) {
        this.socialService = socialService;
        this.imageStorageService = imageStorageService;
    }

    @PostMapping("/social/post")
    public String createPost(
        @RequestParam(required = false) String content,
        @RequestParam(required = false) MultipartFile image,
        @AuthenticationPrincipal OidcUser principal
    ) throws Exception {
        String imageUrl = null;
        if (image != null && !image.isEmpty()) {
            imageUrl = imageStorageService.upload(image);
        }
        socialService.createPost(principal.getEmail(), content, imageUrl);
        return "redirect:/#tab-social";
    }

    @PostMapping("/social/friends/request")
    public String sendRequest(@RequestParam String email,
                              @AuthenticationPrincipal OidcUser principal) {
        socialService.sendFriendRequest(principal.getEmail(), email);
        return "redirect:/#tab-social";
    }

    @PostMapping("/social/friends/accept/{id}")
    public String acceptRequest(@PathVariable Long id,
                                @AuthenticationPrincipal OidcUser principal) {
        socialService.acceptRequest(id, principal.getEmail());
        return "redirect:/#tab-social";
    }

    @PostMapping("/social/friends/reject/{id}")
    public String rejectRequest(@PathVariable Long id,
                                @AuthenticationPrincipal OidcUser principal) {
        socialService.rejectRequest(id, principal.getEmail());
        return "redirect:/#tab-social";
    }
}
