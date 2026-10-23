/*
 * Copyright (C) 2022 The Android Open Source Project
 * Licensed under the Apache License, Version 2.0.
 * https://www.apache.org/licenses/LICENSE-2.0
 */
#include <cstring>
#include <jni.h>
#include "shared_counter.h"

static_assert(sizeof(jlong) >= sizeof(volatile std::atomic<uint32_t>*),
              "jlong not large enough for pointer");

static jint ThrowIoException(JNIEnv* env, const char* message) {
    jclass ioExceptionClass = env->FindClass("java/io/IOException");
    if (ioExceptionClass == nullptr) return -1;
    return env->ThrowNew(ioExceptionClass, message);
}

extern "C" {
JNIEXPORT jint JNICALL
Java_androidx_datastore_core_NativeSharedCounter_nativeTruncateFile(
    JNIEnv* env, jclass, jint fd) {
    if (int errNum = datastore::TruncateFile(fd)) {
        return ThrowIoException(env, strerror(errNum));
    }
    return 0;
}

JNIEXPORT jlong JNICALL
Java_androidx_datastore_core_NativeSharedCounter_nativeCreateSharedCounter(
    JNIEnv* env, jclass, jint fd) {
    void* address = nullptr;
    if (int errNum = datastore::CreateSharedCounter(fd, &address)) {
        return ThrowIoException(env, strerror(errNum));
    }
    return reinterpret_cast<jlong>(address);
}

JNIEXPORT jint JNICALL
Java_androidx_datastore_core_NativeSharedCounter_nativeGetCounterValue(
    JNIEnv*, jclass, jlong address) {
    return static_cast<jint>(datastore::GetCounterValue(
        reinterpret_cast<std::atomic<uint32_t>*>(address)));
}

JNIEXPORT jint JNICALL
Java_androidx_datastore_core_NativeSharedCounter_nativeIncrementAndGetCounterValue(
    JNIEnv*, jclass, jlong address) {
    return static_cast<jint>(datastore::IncrementAndGetCounterValue(
        reinterpret_cast<std::atomic<uint32_t>*>(address)));
}
}
