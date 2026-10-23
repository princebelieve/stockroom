/*
 * Copyright (C) 2022 The Android Open Source Project
 * Licensed under the Apache License, Version 2.0.
 * https://www.apache.org/licenses/LICENSE-2.0
 */
#include <errno.h>
#include <sys/mman.h>
#include <unistd.h>

#include <atomic>
#include <cstdint>

#include "shared_counter.h"

namespace {
constexpr int NUM_BYTES = 4;
}

static_assert(sizeof(std::atomic<uint32_t>) == NUM_BYTES,
              "Unexpected atomic<uint32_t> size");
static_assert(std::atomic<uint32_t>::is_always_lock_free == true,
              "atomic<uint32_t> is not always lock free");

namespace datastore {
int TruncateFile(int fd) {
    return (ftruncate(fd, NUM_BYTES) == 0) ? 0 : errno;
}

int CreateSharedCounter(int fd, void** counter_address) {
    void* mmap_result = mmap(nullptr, NUM_BYTES, PROT_READ | PROT_WRITE,
                             MAP_SHARED | MAP_POPULATE, fd, 0);
    if (mmap_result == MAP_FAILED) {
        return errno;
    }
    *counter_address = mmap_result;
    return 0;
}

uint32_t GetCounterValue(std::atomic<uint32_t>* address) {
    auto counter_atomic = reinterpret_cast<volatile std::atomic<uint32_t>*>(address);
    return counter_atomic->load();
}

uint32_t IncrementAndGetCounterValue(std::atomic<uint32_t>* address) {
    auto counter_atomic = reinterpret_cast<volatile std::atomic<uint32_t>*>(address);
    return counter_atomic->fetch_add(1) + 1;
}
} // namespace datastore
