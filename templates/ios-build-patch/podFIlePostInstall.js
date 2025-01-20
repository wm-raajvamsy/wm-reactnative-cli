const newPostInstallBlock = 
`post_install do |installer|
  react_native_post_install(
    installer,
    config[:reactNativePath],
    :mac_catalyst_enabled => false
  )

  # Set provisioning profile to "None" for all pod targets
  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |config|
      config.build_settings['PROVISIONING_PROFILE'] = 'None'
      config.build_settings['CODE_SIGN_IDENTITY'] = ''
      config.build_settings['CODE_SIGNING_ALLOWED'] = 'NO' 
    end
  end

  # Disable code signing for resource bundle targets
  installer.target_installation_results.pod_target_installation_results
    .each do |pod_name, target_installation_result|
    target_installation_result.resource_bundle_targets.each do |resource_bundle_target|
      resource_bundle_target.build_configurations.each do |config|
        config.build_settings['CODE_SIGNING_ALLOWED'] = 'NO'
        config.build_settings['PROVISIONING_PROFILE'] = 'None' 
        config.build_settings['CODE_SIGN_IDENTITY'] = '' 
      end
    end
  end
end`;

module.exports = {
  newPostInstallBlock
}