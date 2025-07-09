package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"slices"
	"time"

	"github.com/kofj/gorm-driver-d1/gormd1"
	"github.com/tanmaydatta/split-expense-with-wife/splitexpense/common"
	"gorm.io/gorm"
)

type BudgetMonthlyRequest struct {
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

func BudgetMonthlyHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "invalid method", http.StatusBadRequest)
		return
	}

	valid, session := common.Authenticate(r)
	if !valid {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req BudgetMonthlyRequest
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "failed to read request body", http.StatusInternalServerError)
		return
	}
	if err := json.Unmarshal(body, &req); err != nil {
		http.Error(w, fmt.Sprintf("Error parsing input, %v", err.Error()), http.StatusServiceUnavailable)
		return
	}

	if err := validateBudgetMonthlyRequest(&req, session); err != nil {
		log.Default().Println(err)
		http.Error(w, err.Error(), http.StatusServiceUnavailable)
		return
	}

	dsn := os.Getenv("DSN_D1")
	if dsn == "" {
		log.Println("DSN_D1 environment variable not set")
		http.Error(w, "Internal server error: DSN not configured", http.StatusInternalServerError)
		return
	}
	db, err := gorm.Open(gormd1.Open(dsn), &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		log.Printf("failed to connect to D1: %v", err)
		http.Error(w, "[budget_monthly] failed to connect to db", http.StatusServiceUnavailable)
		return
	}

	name := req.Name
	if name == "" {
		name = "house"
	}

	now := time.Now()
	oldestData := now.AddDate(-2, 0, 0).Format("2006-01-02 15:04:05")

	type MonthlyData struct {
		Month    int     `json:"month"`
		Year     int     `json:"year"`
		Currency string  `json:"currency"`
		Amount   float64 `json:"amount"`
	}
	monthlyData := []MonthlyData{}

	query := `
		SELECT
			CAST(strftime('%m', added_time) AS INTEGER) as month,
			CAST(strftime('%Y', added_time) AS INTEGER) as year,
			currency,
			SUM(amount) as amount
		FROM budget
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

	tx := db.Raw(query, name, session.Group.Groupid, oldestData).Scan(&monthlyData)
	if tx.Error != nil {
		http.Error(w, "[budget_monthly] error querying database: "+tx.Error.Error(), http.StatusServiceUnavailable)
		return
	}

	monthToName := map[int]string{
		1: "January", 2: "February", 3: "March", 4: "April", 5: "May", 6: "June",
		7: "July", 8: "August", 9: "September", 10: "October", 11: "November", 12: "December",
	}

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

	result := make([]MonthlyBudget, 0, len(monthlyMap))
	for _, budget := range monthlyMap {
		result = append(result, *budget)
	}

	slices.SortFunc(result, func(i, j MonthlyBudget) int {
		if i.Year != j.Year {
			return j.Year - i.Year
		}
		var iMonth, jMonth int
		for num, name := range monthToName {
			if name == i.Month {
				iMonth = num
			}
			if name == j.Month {
				jMonth = num
			}
		}
		return jMonth - iMonth
	})

	b, err := json.Marshal(result)
	if err != nil {
		http.Error(w, "failed to marshal response", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write(b)
}

func validateBudgetMonthlyRequest(req *BudgetMonthlyRequest, session *common.CurrentSession) error {
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
