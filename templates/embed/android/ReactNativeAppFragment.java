package com.wavemaker.reactnative;

import android.os.Bundle;

import androidx.fragment.app.Fragment;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;

import com.facebook.react.ReactFragment;
import ${packageName}.R;

/**
 * A simple {@link Fragment} subclass.
 * Use the {@link ReactNativeAppFragment#newInstance} factory method to
 * create an instance of this fragment.
 */
public class ReactNativeAppFragment extends Fragment {

    // TODO: Rename parameter arguments, choose names that match
    // the fragment initialization parameters, e.g. ARG_ITEM_NUMBER
    private static final String PAGE_NAME = "pageName";

    // TODO: Rename and change types of parameters
    private String pageName;

    public ReactNativeAppFragment() {
        // Required empty public constructor
    }

    /**
     * Use this factory method to create a new instance of
     * this fragment using the provided parameters.
     *
     * @param pageName Parameter 2.
     * @return A new instance of fragment ReactNativeAppFragment.
     */
    // TODO: Rename and change types and number of parameters
    public static ReactNativeAppFragment newInstance(String pageName) {
        ReactNativeAppFragment fragment = new ReactNativeAppFragment();
        Bundle args = new Bundle();
        args.putString(PAGE_NAME, pageName);
        fragment.setArguments(args);
        return fragment;
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (getArguments() != null) {
            pageName = getArguments().getString(PAGE_NAME);
        }
        Fragment reactNativeFragment = new ReactFragment.Builder()
                .setComponentName("main")
                .setLaunchOptions(getLaunchOptions(pageName))
                .build();

        this.getChildFragmentManager().beginTransaction()
                .add(R.id.reactNativeFragment, reactNativeFragment)
                .commit();
    }

    @Override
    public View onCreateView(LayoutInflater inflater, ViewGroup container,
                             Bundle savedInstanceState) {
        setHasOptionsMenu(true);
        // Inflate the layout for this fragment
        return inflater.inflate(R.layout.fragment_react_native_app, container, false);
    }

    private Bundle getLaunchOptions(String pageName) {
        Bundle initialProperties = new Bundle();
        initialProperties.putString("pageName", pageName);
        return initialProperties;
    }
}