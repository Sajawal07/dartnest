package com.dartnest.app;

import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private View splashView;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Attach custom splash overlay on top of the WebView during launch
        try {
            ViewGroup rootView = findViewById(android.R.id.content);
            if (rootView != null) {
                splashView = LayoutInflater.from(this).inflate(R.layout.splash_overlay, rootView, false);
                rootView.addView(splashView);

                // Fade out splash screen after the app loads
                new Handler(Looper.getMainLooper()).postDelayed(new Runnable() {
                    @Override
                    public void run() {
                        if (splashView != null) {
                            splashView.animate()
                                .alpha(0f)
                                .setDuration(350)
                                .withEndAction(new Runnable() {
                                    @Override
                                    public void run() {
                                        if (splashView != null && splashView.getParent() != null) {
                                            ((ViewGroup) splashView.getParent()).removeView(splashView);
                                            splashView = null;
                                        }
                                    }
                                });
                        }
                    }
                }, 2200);
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
