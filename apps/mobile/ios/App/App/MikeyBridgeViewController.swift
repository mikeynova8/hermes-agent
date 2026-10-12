import Capacitor

final class MikeyBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(MikeyActivityPlugin())
        bridge?.registerPluginInstance(MikeyPhoneDataPlugin())
    }
}
