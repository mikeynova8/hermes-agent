import threading

from tui_gateway import server


class Transport:
    def __init__(self):
        self.frames = []

    def write(self, obj):
        self.frames.append(obj)
        return True

    def close(self):
        pass


def test_phone_request_reports_offline_without_binding():
    response = server.handle_request({
        "jsonrpc": "2.0", "id": "r1", "method": "mikey.phone.request",
        "params": {"session_id": "selected", "device_id": "device", "kind": "location"},
    })
    assert response["error"]["data"]["status"] == "offline"


def test_phone_request_round_trip_is_selected_and_typed():
    transport = Transport()
    session_id = "selected"
    device_id = "123e4567-e89b-12d3-a456-426614174000"
    server.register_phone_binding(session_id, device_id, transport)

    def respond():
        while not transport.frames:
            pass
        request = transport.frames[0]
        server.handle_phone_response({
            "jsonrpc": "2.0", "id": request["id"],
            "result": {"request_id": request["id"], "session_id": session_id, "device_id": device_id, "kind": "location", "status": "ok", "result": {"latitude": 41.4}},
        }, transport)

    thread = threading.Thread(target=respond)
    thread.start()
    response = server._request_phone("r2", {"session_id": session_id, "device_id": device_id, "kind": "location"})
    thread.join(timeout=1)
    assert response["result"]["status"] == "ok"
    assert transport.frames[0]["method"] == "mikey.phone.request"
    assert transport.frames[0]["params"]["session_id"] == session_id
    server.unregister_phone_transport(transport)
