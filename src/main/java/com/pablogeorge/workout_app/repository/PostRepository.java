package com.pablogeorge.workout_app.repository;

import com.pablogeorge.workout_app.model.Post;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface PostRepository extends JpaRepository<Post, Long> {
    List<Post> findTop50ByAuthorIdInOrderByCreatedAtDesc(Collection<String> authorIds);
}
