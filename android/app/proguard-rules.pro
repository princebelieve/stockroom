# Capacitor's Android library supplies consumer keep rules for plugin classes,
# PluginMethod handlers, and permission/activity callbacks discovered through
# reflection. Preserve their runtime annotations in the optimized app.
-keepattributes *Annotation*

# Keep line information for mapping-assisted crash reports while replacing
# source filenames with a generic name in obfuscated stack traces.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
