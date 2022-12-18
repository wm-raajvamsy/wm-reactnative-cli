import SwiftUI
import UIKit
import EmbedCommModule

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
        CommunicationService.INSTANCE.process(
            messageType: "close",
            processor: {(message: NSDictionary?, promise: Promise?) in
                DispatchQueue.main.async(execute: {
                    self.navigationController?.popViewController(animated: true);
                    self.dismiss(animated: true);
                });
        });
    }
    
    override func viewWillDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated);
        CommunicationService.INSTANCE.removeProcessor(messageType: "close");
    }
    
}