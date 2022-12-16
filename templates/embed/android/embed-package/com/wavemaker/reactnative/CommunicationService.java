package com.wavemaker.reactnative;

import com.facebook.react.bridge.Callback;
import com.facebook.react.bridge.ReadableMap;

import java.util.HashMap;
import java.util.Map;

public class CommunicationService {
    public static final CommunicationService INSTANCE = new CommunicationService();
    private Map<String, MessageProcessor> processorMap = new HashMap<>();

    private CommunicationService() {}

    public void onMessage(String messageType, ReadableMap message, Callback callback) {
        MessageProcessor processor = this.processorMap.get(messageType);
        if (processor != null) {
            processor.process(message, callback);
        }
    }

    public void process(String messageType, MessageProcessor processor) {
        this.processorMap.put(messageType, processor);
    }

    public void removeProcessor(String messageType) {
        this.removeProcessor(this.processorMap.get(messageType));
    }
    public void removeProcessor(MessageProcessor processor) {
        this.processorMap.remove(processor);
    }
}