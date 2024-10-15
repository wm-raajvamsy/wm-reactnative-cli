#import "ReactNativeView.h"

#import <React/RCTBridge.h>
#import <React/RCTBundleURLProvider.h>
#import <React/RCTRootView.h>
#import <React/RCTLinkingManager.h>
#import <React/RCTConvert.h>

#import <RCTAppSetupUtils.h>

#if RCT_NEW_ARCH_ENABLED
#import <React/CoreModulesPlugins.h>
#import <React/RCTCxxBridgeDelegate.h>
#import <React/RCTFabricSurfaceHostingProxyRootView.h>
#import <React/RCTSurfacePresenter.h>
#import <React/RCTSurfacePresenterBridgeAdapter.h>
#import <ReactCommon/RCTTurboModuleManager.h>

#import <react/config/ReactNativeConfig.h>

#endif

@implementation ReactNativeView

static RCTBridge *bridge;

UIView *_view;

NSString* pageName = nil;

- (ReactNativeView*) initWithPageName:(NSString *)aPageName {
    if (self = [super init]) {
        pageName = aPageName;
    }
    if (!bridge) {
        bridge = [self.reactDelegate createBridgeWithDelegate:self launchOptions: nil];
    }
    _view = [self.reactDelegate createRootViewWithBridge:bridge moduleName:@"main" initialProperties:@{@"pageName": pageName}];
    return self;
}

- (UIView *)view {
    return _view;
}

- (NSArray<id<RCTBridgeModule>> *)extraModulesForBridge:(RCTBridge *)bridge
{
  // If you'd like to export some custom RCTBridgeModules, add them here!
  return @[];
}

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
  return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
}



@end
