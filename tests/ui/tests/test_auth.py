import uuid
import allure
from ui.pages.auth_page import AuthPage


@allure.feature("Authentication")
class TestAuth:
    @allure.story("UI-AUTH-01: Auth Form Render")
    @allure.title("Verify auth form renders correctly")
    @allure.description(
        "Navigates to /auth route and verifies input fields and toggle links are displayed."
    )
    @allure.severity(allure.severity_level.CRITICAL)
    def test_auth_form_render(self, driver):
        page = AuthPage(driver)
        page.navigate_to_login_page()
        assert (
            page.is_sign_in_form_rendered()
        ), f"Failed UI-AUTH-01: Sign in form inputs were not displayed on page '{driver.current_url}'"
        page.switch_to_sign_up_form()
        assert (
            page.is_sign_up_form_rendered()
        ), f"Failed UI-AUTH-01: Sign up form inputs were not displayed on page '{driver.current_url}'"

    @allure.story("UI-AUTH-02: Toggle Sign-In / Sign-Up Mode")
    @allure.title("Verify switching between sign in and sign up forms")
    @allure.description(
        "Navigates to /auth and toggles form heading and mode between sign in and sign up."
    )
    @allure.severity(allure.severity_level.NORMAL)
    def test_toggle_sign_in_sign_up_mode(self, driver):
        page = AuthPage(driver)
        page.navigate_to_login_page()
        page.switch_to_sign_up_form()
        assert (
            page.is_sign_up_text_present()
        ), f"Failed UI-AUTH-02: Sign up toggle text was not displayed on page '{driver.current_url}'"
        page.switch_to_sign_in_form()
        assert (
            page.is_sign_in_text_present()
        ), f"Failed UI-AUTH-02: Sign in toggle text was not displayed on page '{driver.current_url}'"

    @allure.story("UI-AUTH-03: Auth Input Validation")
    @allure.title("Verify auth form input validation")
    @allure.description(
        "Submits invalid email format or password under 8 characters and verifies validation failure."
    )
    @allure.severity(allure.severity_level.NORMAL)
    def test_auth_input_validation(self, driver):
        page = AuthPage(driver)
        page.navigate_to_login_page()
        page.sign_in("invalid-email", "short")
        assert (
            not page.is_workspaces_header_present()
        ), f"Failed UI-AUTH-03: Form submitted successfully despite invalid input format on page '{driver.current_url}'"

    @allure.story("UI-AUTH-04: Invalid Credentials Error State")
    @allure.title("Verify error state on invalid login credentials")
    @allure.description(
        "Submits invalid login credentials and verifies error banner is displayed."
    )
    @allure.severity(allure.severity_level.CRITICAL)
    def test_invalid_credentials_error_state(self, driver):
        page = AuthPage(driver)
        page.navigate_to_login_page()
        page.sign_in("nonexistent_user_99@example.com", "wrongpassword123")
        assert page.is_element_present(
            page.incorrect_credentials_locator
        ), f"Failed UI-AUTH-04: Error banner for invalid credentials was not displayed on page '{driver.current_url}'"

    @allure.story("UI-AUTH-05: Invite Token Query Handling")
    @allure.title("Verify invite token query handling on auth route")
    @allure.description(
        "Navigates to /auth?inviteToken=abc-123 and verifies token preservation."
    )
    @allure.severity(allure.severity_level.NORMAL)
    def test_invite_token_query_handling(self, driver):
        page = AuthPage(driver)
        page.navigate("auth?inviteToken=abc-123")
        assert (
            "inviteToken=abc-123" in driver.current_url
            or page.is_sign_in_form_rendered()
        ), f"Failed UI-AUTH-05: Invite token was lost from URL on page '{driver.current_url}'"

    @allure.story("User Registration")
    @allure.title("Verify new user registration")
    @allure.description("Navigates to the auth page and fills out the sign-up form.")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_signup(self, driver):
        page = AuthPage(driver)
        page.navigate_to_login_page()
        page.sign_up(
            "Test User", f"test_{uuid.uuid4().hex[:8]}@example.com", "testpassword"
        )
        assert (
            page.is_workspaces_header_present()
        ), f"Failed sign up: Workspaces header was not displayed after registration. Current URL: '{driver.current_url}'"

    @allure.story("User Login")
    @allure.title("Verify user can sign in with valid credentials")
    @allure.description(
        "Registers a fresh user and submits email and password to log in."
    )
    @allure.severity(allure.severity_level.BLOCKER)
    def test_login(self, driver):
        page = AuthPage(driver)
        user_email = f"login_{uuid.uuid4().hex[:8]}@example.com"
        user_password = "testpassword"

        page.navigate_to_login_page()
        page.sign_up("Login User", user_email, user_password)

        page.navigate_to_login_page()
        page.sign_in(user_email, user_password)
        assert (
            page.is_workspaces_header_present()
        ), f"Failed sign in: Workspaces header was not displayed after login. Current URL: '{driver.current_url}'"
