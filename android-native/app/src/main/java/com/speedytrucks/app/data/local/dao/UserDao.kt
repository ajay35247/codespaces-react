package com.speedytrucks.app.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.speedytrucks.app.data.local.entity.UserEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface UserDao {

    /** Observe the current user as a reactive stream (null when logged out). */
    @Query("SELECT * FROM users LIMIT 1")
    fun observeCurrentUser(): Flow<UserEntity?>

    /** One-shot read of the cached user. */
    @Query("SELECT * FROM users LIMIT 1")
    suspend fun getCurrentUser(): UserEntity?

    /** Insert or replace the current user (replaces on duplicate primary key). */
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertUser(user: UserEntity)

    /** Wipe all user data on logout. */
    @Query("DELETE FROM users")
    suspend fun clearAllUsers()
}
