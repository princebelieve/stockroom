/*
 * Copyright (C) 2022 The Android Open Source Project
 * Licensed under the Apache License, Version 2.0.
 * https://www.apache.org/licenses/LICENSE-2.0
 */
#include <atomic>
#include <cstdint>

#ifndef DATASTORE_SHARED_COUNTER_H
#define DATASTORE_SHARED_COUNTER_H

namespace datastore {
int TruncateFile(int fd);
int CreateSharedCounter(int fd, void** counter_address);
uint32_t GetCounterValue(std::atomic<uint32_t>* counter);
uint32_t IncrementAndGetCounterValue(std::atomic<uint32_t>* counter);
} // namespace datastore

#endif // DATASTORE_SHARED_COUNTER_H
