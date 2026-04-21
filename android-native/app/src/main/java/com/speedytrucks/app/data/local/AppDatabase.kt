package com.speedytrucks.app.data.local

import androidx.room.Database
import androidx.room.RoomDatabase
import com.speedytrucks.app.data.local.dao.UserDao
import com.speedytrucks.app.data.local.entity.UserEntity

@Database(
    entities = [UserEntity::class],
    version = 1,
    exportSchema = true,
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun userDao(): UserDao
}
