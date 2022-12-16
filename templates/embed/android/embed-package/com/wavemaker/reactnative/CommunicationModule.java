package com.wavemaker.reactnative;
import android.app.Activity;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Callback;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableMap;

public class CommunicationModule extends ReactContextBaseJavaModule {

    CommunicationModule(ReactApplicationContext context) {
        super(context);
        CommunicationService.INSTANCE.process("finish", (message, callback) -> {
            callback.invoke();
            context.getCurrentActivity().finish();
        });
    }

    @NonNull
    @Override
    public String getName() {
        return "EmbedCommModule";
    }

    @ReactMethod
    public void sendToNative(String messageType, ReadableMap message, Callback callback) {
        CommunicationService.INSTANCE.onMessage(messageType, message, callback);
    }

}