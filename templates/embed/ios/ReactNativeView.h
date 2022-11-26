#import <Foundation/Foundation.h>
#import <React/RCTBridgeDelegate.h>
#import <UIKit/UIKit.h>

#import <Expo/Expo.h>

@interface ReactNativeView : EXAppDelegateWrapper <RCTBridgeDelegate>
@property (nonatomic, strong) UIView *view;

- (ReactNativeView*) initWithPageName:(NSString *)aPageName;

@end
