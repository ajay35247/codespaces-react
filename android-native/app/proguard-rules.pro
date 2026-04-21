# Add project-specific ProGuard rules here.

# Preserve annotation information needed by Hilt, Room, Retrofit, etc.
-keepattributes *Annotation*
-keepattributes Signature
-keepattributes Exceptions

# Retrofit
-keep class retrofit2.** { *; }
-keepclasseswithmembers class * {
    @retrofit2.http.* <methods>;
}
-dontwarn retrofit2.**

# OkHttp
-dontwarn okhttp3.**
-dontwarn okio.**
-keep class okhttp3.** { *; }

# Gson – keep all DTO classes so their fields are not stripped
-keep class com.google.gson.** { *; }
-keep class * implements com.google.gson.TypeAdapterFactory { *; }
-keep class * implements com.google.gson.JsonSerializer { *; }
-keep class * implements com.google.gson.JsonDeserializer { *; }
-keepclassmembers class com.speedytrucks.app.data.remote.dto.** { *; }

# Room
-keep class * extends androidx.room.RoomDatabase
-keep @androidx.room.Entity class *

# Hilt / Dagger
-keep class dagger.hilt.** { *; }
-keep class javax.inject.** { *; }
-keepnames @dagger.hilt.android.lifecycle.HiltViewModel class *

# Kotlinx Serialization (type-safe navigation)
-keepattributes RuntimeVisibleAnnotations
-keep class kotlinx.serialization.** { *; }

# Timber – strip debug log calls in release builds
-assumenosideeffects class timber.log.Timber {
    public static *** v(...);
    public static *** d(...);
    public static *** i(...);
}
