package com.financetracker.notification;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

// Bare Repository like the others: every query names the user, except the cleanup of an endpoint
// the push service itself reported gone.
public interface PushSubscriptionRepository extends Repository<PushSubscription, UUID> {

    List<PushSubscription> findAllByUserId(UUID userId);

    long countByUserId(UUID userId);

    // One statement: a new browser is added, a known one (the same endpoint) moves to this user
    // with its fresh keys. Selecting from users makes it a no-op (0) for a deleted account.
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query(value = """
            insert into push_subscriptions (user_id, endpoint, p256dh, auth)
            select id, :endpoint, :p256dh, :auth from users where id = :userId
            on conflict (endpoint) do update
                set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
                    subscribed_at = now()
            """, nativeQuery = true)
    int upsert(@Param("userId") UUID userId, @Param("endpoint") String endpoint,
            @Param("p256dh") String p256dh, @Param("auth") String auth);

    // Keeps the newest `keep` browsers of a user, so old phones do not pile up.
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query(value = """
            delete from push_subscriptions where user_id = :userId and id not in (
                select id from push_subscriptions where user_id = :userId
                order by subscribed_at desc, id limit :keep)
            """, nativeQuery = true)
    int keepNewest(@Param("userId") UUID userId, @Param("keep") int keep);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("delete from PushSubscription s where s.endpoint = :endpoint and s.userId = :userId")
    int deleteByEndpointAndUser(@Param("endpoint") String endpoint, @Param("userId") UUID userId);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("delete from PushSubscription s where s.endpoint = :endpoint")
    int deleteGone(@Param("endpoint") String endpoint);
}
