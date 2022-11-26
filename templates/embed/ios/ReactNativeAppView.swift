import SwiftUI
import UIKit
import React

struct ReactNativeSwiftView: UIViewRepresentable {
    var pageName = ""
    
    init(pageName: String) {
        self.pageName = pageName;
    }
    
    typealias UIViewType = UIView
    
    typealias UIViewControllerType = UIViewController
    
    func makeUIView(context: Context) -> UIView {
        return ReactNativeView(pageName: self.pageName).view;
    }
    func updateUIView(_ uiView: UIView, context: Context) {
        //
    }
}

struct ReactNativePageView: View {
    var pageName = ""
    
    var body: some View {
        ReactNativeSwiftView(pageName: self.pageName)
    }
}

struct ReactNativeAppView_Previews: PreviewProvider {
    static var previews: some View {
        ReactNativeSwiftView(pageName: "")
    }
}
