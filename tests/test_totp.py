import os
import sys
import tempfile
import pyotp
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from app import app
from database import init_db

@pytest.fixture
def totp_client():
    app.config["TESTING"] = True
    app.config["SECRET_KEY"] = "test-secret-key-for-totp-testing-parul"
    db_fd, temp_db_path = tempfile.mkstemp(suffix=".db")
    app.config["DATABASE_PATH"] = temp_db_path
    os.environ["DATABASE_PATH"] = temp_db_path
    os.environ["DEMO_MODE"] = "true"

    init_db(temp_db_path)

    with app.test_client() as client:
        yield client

    os.close(db_fd)
    if os.path.exists(temp_db_path):
        os.remove(temp_db_path)

def test_totp_setup_and_verification(totp_client):
    email = "totp_user@parul.ac.in"
    reg_res = totp_client.post("/api/auth/register", json={
        "fullName": "TOTP Tester",
        "email": email,
        "phone": "+91 98888 77777",
        "role": "patient",
        "password": "Password123!"
    })
    assert reg_res.status_code == 201
    reg_data = reg_res.get_json()
    assert "totp_secret" in reg_data
    assert "totp_qr" in reg_data
    assert reg_data["totp_qr"].startswith("data:image/png;base64,")

    secret = reg_data["totp_secret"]

    # Test setup endpoint
    setup_res = totp_client.get(f"/api/auth/totp/setup?email={email}")
    assert setup_res.status_code == 200
    setup_data = setup_res.get_json()
    assert setup_data["totp_secret"] == secret
    assert setup_data["totp_qr"].startswith("data:image/png;base64,")

    # Generate Google Authenticator code
    totp = pyotp.TOTP(secret)
    current_code = totp.now()

    # Verify with wrong code first
    wrong_res = totp_client.post("/api/auth/verify-otp", json={
        "email": email,
        "otp": "000000" if current_code != "000000" else "111111"
    })
    assert wrong_res.status_code == 400

    # Verify with actual Google Authenticator code
    good_res = totp_client.post("/api/auth/verify-otp", json={
        "email": email,
        "otp": current_code
    })
    assert good_res.status_code == 200
    good_data = good_res.get_json()
    assert "token" in good_data
    assert good_data["user"]["email"] == email

    # Verify session token works on authenticated route
    me_res = totp_client.get("/api/auth/me", headers={"Authorization": f"Bearer {good_data['token']}"})
    assert me_res.status_code == 200
    assert me_res.get_json()["user"]["email"] == email
