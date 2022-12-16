package com.wavemaker.reactnative;

import com.facebook.react.bridge.Callback;
import com.facebook.react.bridge.ReadableMap;

public interface MessageProcessor {
    public void process(ReadableMap message, Callback callback);
}
