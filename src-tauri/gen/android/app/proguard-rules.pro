# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Keep native player classes
-keep class com.iptv.tauri.** { *; }
-keep class com.iptv.tauri.player.** { *; }

# Keep XmlPullParser (used by EpgFetcher)
-keep class org.xmlpull.v1.** { *; }

# Keep JavascriptInterface methods
-keepclassmembers class com.iptv.tauri.MainActivity$* {
    @android.webkit.JavascriptInterface <methods>;
}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile