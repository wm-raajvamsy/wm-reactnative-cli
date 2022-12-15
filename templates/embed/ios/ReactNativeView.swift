import SwiftUI
import UIKit

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

@available(iOS 13.0, *)
struct ReactNativePageView: View {
    var pageName = ""
    
    @available(iOS 13.0, *)
    var body: some View {
        ReactNativeSwiftView(pageName: self.pageName)
    }
}

@available(iOS 13.0, *)
class ReactNativeHostingController: UIHostingController<ReactNativePageView> {
    required init?(coder aDecoder: NSCoder) {
        super.init(coder: aDecoder, rootView: ReactNativePageView(pageName: ""))
    }
}