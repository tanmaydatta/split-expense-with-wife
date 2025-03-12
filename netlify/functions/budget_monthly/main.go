package main

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"slices"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/tanmaydatta/split-expense-with-wife/netlify/common"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

type Request struct {
	Name string `json:"name"`
}

type MonthlyAmount struct {
	Currency string  `json:"currency"`
	Amount   float64 `json:"amount"`
}

type MonthlyBudget struct {
	Month   string          `json:"month"`
	Year    int             `json:"year"`
	Amounts []MonthlyAmount `json:"amounts"`
}

func handler(request events.APIGatewayProxyRequest) (*events.APIGatewayProxyResponse, error) {
	if request.HTTPMethod != "POST" {
		return &events.APIGatewayProxyResponse{
			StatusCode: 400,
		}, nil
	}

	valid, session := common.Authenticate(request)
	if !valid {
		return &events.APIGatewayProxyResponse{
			StatusCode: 401,
			Body:       "unauthorized",
		}, nil
	}

	var req = Request{}
	if err := json.Unmarshal([]byte(request.Body), &req); err != nil {
		return &events.APIGatewayProxyResponse{
			StatusCode: 503,
			Body:       fmt.Sprintf("Error parsing input, %v", err.Error()),
		}, nil
	}

	if err := validateBudgetRequest(&req, session); err != nil {
		log.Default().Println(err)
		return &events.APIGatewayProxyResponse{
			StatusCode: 503,
			Body:       err.Error(),
		}, nil
	}

	// Open a connection to database
	db, err := gorm.Open(postgres.Open(os.Getenv("DSN_POSTGRES")), &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		log.Fatalf("failed to connect: %v", err)
		return &events.APIGatewayProxyResponse{
			StatusCode: 503,
			Body:       "[budget_monthly] failed to connect to db",
		}, nil
	}

	name := req.Name
	if name == "" {
		name = "house"
	}

	// Get the current time to set a limit of looking back 6 months
	now := time.Now()
	sixMonthsAgo := now.AddDate(0, -6, 0)

	// Query to get monthly totals
	type MonthlyData struct {
		Month    int     `json:"month"`
		Year     int     `json:"year"`
		Currency string  `json:"currency"`
		Amount   float64 `json:"amount"`
	}
	monthlyData := []MonthlyData{}

	// Use date_part or extract to get month and year components from timestamp
	// Note: SQL functions may differ by DB provider - this is for PostgreSQL
	query := `
		SELECT
			EXTRACT(MONTH FROM added_time) as month,
			EXTRACT(YEAR FROM added_time) as year,
			currency,
			SUM(amount) as amount
		FROM finances_db.budget
		WHERE 
			name = ? AND 
			groupid = ? AND 
			deleted IS NULL AND
			added_time >= ? AND
			amount < 0
		GROUP BY 
			1, 2, 3
		ORDER BY 
			2 DESC, 
			1 DESC
	`

	tx := db.Raw(query, name, session.Group.Groupid, sixMonthsAgo).Scan(&monthlyData)
	if tx.Error != nil {
		return &events.APIGatewayProxyResponse{
			StatusCode: 503,
			Body:       "[budget_monthly] error querying database: " + tx.Error.Error(),
		}, nil
	}

	// Process the data into the desired format
	monthToName := map[int]string{
		1: "January", 2: "February", 3: "March", 4: "April", 5: "May", 6: "June",
		7: "July", 8: "August", 9: "September", 10: "October", 11: "November", 12: "December",
	}

	// Group data by month/year
	monthlyMap := make(map[string]*MonthlyBudget)
	for _, data := range monthlyData {
		key := fmt.Sprintf("%d-%d", data.Year, data.Month)
		if _, exists := monthlyMap[key]; !exists {
			monthlyMap[key] = &MonthlyBudget{
				Month:   monthToName[data.Month],
				Year:    data.Year,
				Amounts: []MonthlyAmount{},
			}
		}
		monthlyMap[key].Amounts = append(monthlyMap[key].Amounts, MonthlyAmount{
			Currency: data.Currency,
			Amount:   data.Amount,
		})
	}

	// Convert map to slice
	result := make([]MonthlyBudget, 0, len(monthlyMap))
	for _, budget := range monthlyMap {
		result = append(result, *budget)
	}

	// Sort result by year and month (descending)
	slices.SortFunc(result, func(i, j MonthlyBudget) int {
		if i.Year != j.Year {
			return j.Year - i.Year // Descending by year
		}
		// Convert month name to number for comparison
		var iMonth, jMonth int
		for num, name := range monthToName {
			if name == i.Month {
				iMonth = num
			}
			if name == j.Month {
				jMonth = num
			}
		}
		return jMonth - iMonth // Descending by month
	})

	b, _ := json.Marshal(result)
	return &events.APIGatewayProxyResponse{
		StatusCode: 200,
		Body:       string(b),
		Headers: map[string]string{
			"Content-Type": "application/json",
		},
	}, nil
}

func main() {
	// Make the handler available for Remote Procedure Call
	lambda.Start(handler)
}

func validateBudgetRequest(req *Request, session *common.CurrentSession) error {
	budgets := []string{}
	err := json.Unmarshal([]byte(session.Group.Budgets), &budgets)
	if err != nil {
		return fmt.Errorf("error parsing budgets")
	}
	if !slices.Contains(budgets, req.Name) {
		return fmt.Errorf("invalid budget name")
	}
	return nil
}
