Feature: Example Domain page

  Scenario: Page title is correct
    Given I am on the page
    Then the page title should be "Example Domain"

  Scenario: Page contains expected content
    Given I am on the page
    Then I should see a heading "Example Domain"
    And I should see a link "More information..."

  Scenario: Page does not contain unexpected content
    Given I am on the page
    Then I should see a heading "Welcome to Our Store"
